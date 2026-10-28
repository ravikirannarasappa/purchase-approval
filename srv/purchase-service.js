import cds from '@sap/cds';

const { SELECT, INSERT, UPDATE } = cds.ql;

// how many approval levels a request needs
const levelsNeeded = (amount) => (amount <= 50000 ? 1 : amount <= 500000 ? 2 : 3);

export default class PurchaseService extends cds.ApplicationService {
  init() {
    const { PurchaseRequests, Vendors } = this.entities;
    const dbe = cds.entities('purchase');   // plain database tables

    // ---------- helpers ----------
    const getRequest = (req) => {
      const key = req.params[0];
      return SELECT.one.from(PurchaseRequests).where({ ID: key.ID ?? key });
    };

    const checkBudget = async (r) => {
      const year = new Date().getFullYear();
      const budget = await SELECT.one.from(dbe.Budgets).where({ department_ID: r.department_ID, year });
      if (!budget) return 'No budget set for this department';
      const left = Number(budget.total) - Number(budget.spent);
      if (Number(r.totalAmount) > left) {
        return `Budget exceeded: ${left} left, this request needs ${r.totalAmount}`;
      }
      return null;
    };

    // ---------- create a request ----------
    this.before('CREATE', PurchaseRequests, async (req) => {
      const { items, vendor_ID, description } = req.data;

      if (!description) return req.error(400, 'Description is required');
      if (!items || items.length === 0) return req.error(400, 'Add at least one item');

      let total = 0;
      for (const [i, item] of items.entries()) {
        const n = i + 1;
        if (!item.itemName) return req.error(400, `Item ${n}: name is required`);
        if (!(item.quantity > 0)) return req.error(400, `Item ${n}: quantity must be above 0`);
        if (!(item.unitPrice > 0)) return req.error(400, `Item ${n}: unit price must be above 0`);
        item.amount = Math.round(item.quantity * item.unitPrice * 100) / 100;
        total += item.amount;
      }
      req.data.totalAmount = Math.round(total * 100) / 100;

      const vendor = await SELECT.one.from(Vendors).where({ ID: vendor_ID });
      if (!vendor) return req.error(400, 'Vendor not found');
      if (!vendor.active) return req.error(400, 'This vendor is not active');

      const { count } = await SELECT.one.from(PurchaseRequests).columns('count(*) as count');
      req.data.requestNo = 'PR-' + String(count + 1).padStart(4, '0');
      req.data.status = 'Draft';
      req.data.currentLevel = 0;
    });

    // ---------- submit ----------
    this.on('submit', PurchaseRequests, async (req) => {
      const r = await getRequest(req);
      if (!r) return req.error(404, 'Request not found');
      if (r.status !== 'Draft') {
        return req.error(400, `Only Draft requests can be submitted (current status: ${r.status})`);
      }
      const problem = await checkBudget(r);
      if (problem) return req.error(400, problem);

      await UPDATE(PurchaseRequests).set({ status: 'Submitted', currentLevel: 1 }).where({ ID: r.ID });
    });

    // ---------- approve ----------
    this.on('approve', PurchaseRequests, async (req) => {
      const r = await getRequest(req);
      if (!r) return req.error(404, 'Request not found');
      if (r.status !== 'Submitted') {
        return req.error(400, `Only Submitted requests can be approved (current status: ${r.status})`);
      }
      const { approver_ID, comment } = req.data;

      await INSERT.into(dbe.Approvals).entries({
        request_ID: r.ID, level: r.currentLevel, action: 'Approved', comment, approver_ID,
      });

      // more levels to go: move to the next level
      if (r.currentLevel < levelsNeeded(Number(r.totalAmount))) {
        await UPDATE(PurchaseRequests).set({ currentLevel: r.currentLevel + 1 }).where({ ID: r.ID });
        return;
      }

      // last level: check the budget again, then use it
      const problem = await checkBudget(r);
      if (problem) return req.error(400, problem);

      await UPDATE(dbe.Budgets)
        .set({ spent: { '+=': Number(r.totalAmount) } })
        .where({ department_ID: r.department_ID, year: new Date().getFullYear() });
      await UPDATE(PurchaseRequests).set({ status: 'Approved' }).where({ ID: r.ID });
    });

    // ---------- reject ----------
    this.on('rejectRequest', PurchaseRequests, async (req) => {
      const r = await getRequest(req);
      if (!r) return req.error(404, 'Request not found');
      if (r.status !== 'Submitted') {
        return req.error(400, `Only Submitted requests can be rejected (current status: ${r.status})`);
      }
      const { approver_ID, comment } = req.data;
      if (!comment) return req.error(400, 'Please give a reason for rejecting');

      await INSERT.into(dbe.Approvals).entries({
        request_ID: r.ID, level: r.currentLevel, action: 'Rejected', comment, approver_ID,
      });
      await UPDATE(PurchaseRequests).set({ status: 'Rejected' }).where({ ID: r.ID });
    });

    return super.init();
  }
}