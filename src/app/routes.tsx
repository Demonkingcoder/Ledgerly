import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './App';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const SalesPage = lazy(() => import('../features/sales/SalesPage').then((module) => ({ default: module.SalesPage })));
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const PurchasesPage = lazy(() => import('../features/purchases/PurchasesPage').then((module) => ({ default: module.PurchasesPage })));
const CustomersPage = lazy(() => import('../features/customers/CustomersPage').then((module) => ({ default: module.CustomersPage })));
const SuppliersPage = lazy(() => import('../features/suppliers/SuppliersPage').then((module) => ({ default: module.SuppliersPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const AssistantPage = lazy(() => import('../features/assistant/AssistantPage').then((module) => ({ default: module.AssistantPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));

export function AppRoutes() {
  return <Suspense fallback={<div role="status" style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Opening page…</div>}><Routes><Route element={<AppLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="sales" element={<SalesPage />} />
    <Route path="inventory" element={<InventoryPage />} />
    <Route path="purchases" element={<PurchasesPage />} />
    <Route path="customers" element={<CustomersPage />} />
    <Route path="suppliers" element={<SuppliersPage />} />
    <Route path="reports" element={<ReportsPage />} />
    <Route path="assistant" element={<AssistantPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></Suspense>;
}
