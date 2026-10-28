namespace purchase;

using { cuid, managed } from '@sap/cds/common';

entity Departments : cuid {
  name : String(60);
  code : String(10);
}

entity Employees : cuid {
  name       : String(100);
  email      : String(100);
  department : Association to Departments;
}

entity Vendors : cuid {
  name   : String(100);
  email  : String(100);
  active : Boolean default true;
}

entity Budgets : cuid {
  department : Association to Departments;
  year       : Integer;
  total      : Decimal(15,2);
  spent      : Decimal(15,2) default 0;
}

entity PurchaseRequests : cuid, managed {
  requestNo    : String(20);
  requester    : Association to Employees;
  department   : Association to Departments;
  vendor       : Association to Vendors;
  description  : String(255);
  totalAmount  : Decimal(15,2) default 0;
  status       : String(20) default 'Draft';
  currentLevel : Integer default 0;
  items        : Composition of many PurchaseItems on items.request = $self;
  approvals    : Composition of many Approvals on approvals.request = $self;
}

entity PurchaseItems : cuid {
  request   : Association to PurchaseRequests;
  itemName  : String(100);
  quantity  : Integer;
  unitPrice : Decimal(15,2);
  amount    : Decimal(15,2);
}

entity Approvals : cuid, managed {
  request  : Association to PurchaseRequests;
  level    : Integer;
  action   : String(20);
  comment  : String(255);
  approver : Association to Employees;
}