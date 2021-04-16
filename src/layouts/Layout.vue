<template>
  <main>
    <Header class="sticky top-0 z-30" />

    <div class="relative flex w-full h-full">
      <aside class="sticky hidden h-full w-60 top-14 lg:flex">
        <Sidebar-Nav />
      </aside>
      <div class="relative w-full h-full">
        <slot />
      </div>
    </div>
  </main>
</template>

<static-query>
query {
  metadata {
    siteName
  }
}
</static-query>

<script>
  import SidebarNav from '@/components/Sidebar-Nav.vue';

  export default {
    components: {
      Header: () => import('@/components/header/Header.vue'),
      SidebarNav,
    },
  };
</script>

<style lang="css">
  html,
  body {
    @apply text-gray-700 bg-gray-200 transition-all duration-200 ease-in-out dark:text-gray-50 dark:bg-gray-900;
  }
</style>
