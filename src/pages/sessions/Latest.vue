<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-1">
      <Sessions-Feed title="Latest Sessions" :sessions="flattenedSessions" />
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
      SidebarNav: () => import('@/components/Sidebar-Nav.vue'),
      SessionsFeed: () => import('@/components/sessions/Sessions-Feed.vue'),
    },
    metaInfo: {
      title: 'A tea log',
    },
    computed: {
      flattenedSessions() {
        return this.$page.sessions.edges.flatMap((session) => {
          return session.node;
        });
      },
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
