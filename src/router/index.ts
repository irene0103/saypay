import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Two disjoint route trees.
 *
 * `/s/:token` is the share page. It is deliberately NOT nested under AppLayout and must
 * never mount the main stores — see spec §3.11 隱私鐵則. If the share page could read the
 * app's stores, a recipient would see every other transaction, the budget, and debts with
 * other people. That is a privacy incident, so the isolation is structural rather than a
 * convention: the route layer is where it gets enforced.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
      { path: 'ledger', name: 'ledger', component: () => import('@/pages/LedgerPage.vue') },
      { path: 'split', name: 'split', component: () => import('@/pages/SplitPage.vue') },
      { path: 'analytics', name: 'analytics', component: () => import('@/pages/AnalyticsPage.vue') },
      { path: 'budget', name: 'budget', component: () => import('@/pages/BudgetPage.vue') },
      { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue') },
      { path: 'tx/new', name: 'tx-new', component: () => import('@/pages/TransactionEditPage.vue') },
      {
        path: 'tx/:id',
        name: 'tx-edit',
        component: () => import('@/pages/TransactionEditPage.vue'),
        props: true,
      },
    ],
  },
  {
    path: '/s/:token',
    name: 'share',
    component: () => import('@/layouts/ShareLayout.vue'),
    props: true,
    meta: { public: true, noStore: true },
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFound.vue') },
]

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
