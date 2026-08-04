import { createRouter, createWebHistory } from 'vue-router'

// Routes — lazy-loaded per 04-frontend-design.md §5 (NFR-P5 bundle budget).
const routes = [
  {
    path: '/',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
  {
    path: '/profiles',
    name: 'profiles',
    component: () => import('@/views/ProfilesView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
