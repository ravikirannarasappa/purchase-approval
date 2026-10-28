using purchase from '../db/schema';

service PurchaseService {
  entity Departments      as projection on purchase.Departments;
  entity Employees        as projection on purchase.Employees;
  entity Vendors          as projection on purchase.Vendors;
  entity Budgets          as projection on purchase.Budgets;
  entity PurchaseRequests as projection on purchase.PurchaseRequests;
}