<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-100 dark:bg-gray-800"
  >
    <div class="flex-auto">
      <Sessions-Feed :sessions="$page.sessions" class="block" />
    </div>
  </div>
</template>

<page-query>
query {
  sessions: allTasting {
  	edges {
      node {
        title
        date (format: "MMM DD, YYYY")
        path
        id
        excerpt
        style {
          category {
            color
          }
        }
        tags {
    			title
          path
          color
        }
        images {
          image
          alt
        }
      }
    }
  }
}
</page-query>

<script>
  export default {
    components: {
      SessionsFeed: () => import('@/components/sessions/Sessions-Feed.vue'),
      // SessionsFeedMobile: () =>
      //   import('@/components/sessions/Sessions-Feed-Mobile.vue'),
    },
    metaInfo: {
      title: 'Tea',
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
