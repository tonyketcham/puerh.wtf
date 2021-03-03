<template>
  <div class="flex w-full h-full gap-8 overflow-y-auto">
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
