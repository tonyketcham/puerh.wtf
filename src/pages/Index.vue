<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-auto">
      <Sessions-Feed-Mobile
        :sessions="$page.sessions"
        class="block md:hidden"
      />
      <Sessions-Feed :sessions="$page.sessions" class="hidden md:block" />
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
  import SidebarNav from '@/components/Sidebar-Nav.vue';
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';
  import SessionsFeedMobile from '@/components/sessions/Sessions-Feed-Mobile.vue';

  export default {
    components: { SidebarNav, SessionsFeed, SessionsFeedMobile },
    metaInfo: {
      title: 'Tea Time',
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
