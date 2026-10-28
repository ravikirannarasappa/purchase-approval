import cds from '@sap/cds';

const { SELECT } = cds.ql;

export default class PurchaseService extends cds.ApplicationService {
  init() {
    const { PurchaseRequests, Vendors } = this.entities;

    this.before('CREATE', PurchaseRequests, async (req) => {
      const { items, vendor_ID, description } = req.data;

      if (!description) return req.error(400, 'Description is required');
      if (!items || items.length === 0) return req.error(400, 'Add at least one item');

      // check every item and calculate the amounts
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

      // vendor must exist and be active
      const vendor = await SELECT.one.from(Vendors).where({ ID: vendor_ID });
      if (!vendor) return req.error(400, 'Vendor not found');
      if (!vendor.active) return req.error(400, 'This vendor is not active');

      // the server sets these, not the user
      const { count } = await SELECT.one.from(PurchaseRequests).columns('count(*) as count');
      req.data.requestNo = 'PR-' + String(count + 1).padStart(4, '0');
      req.data.status = 'Draft';
      req.data.currentLevel = 0;
    });

    return super.init();
  }
}