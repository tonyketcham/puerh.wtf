<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-1">
      <Sessions-Feed />
    </div>
  </div>
</template>

<page-query>
</page-query>

<script>
  export default {
    components: {
      SidebarNav: () => import('@/components/Sidebar-Nav.vue'),
      SessionsFeed: () => import('@/components/sessions/Sessions-Feed.vue'),
    },
    metaInfo: {
      title: 'A tea log',
    },
  };
</script>
<style lang="scss" scoped>
  .tabs {
    a {
      @apply p-2 rounded-md transition-all;
    }
    a:hover {
      @apply dark:bg-gray-700 bg-gray-300 text-gray-600 dark:text-gray-300;
    }
  }
</style>
