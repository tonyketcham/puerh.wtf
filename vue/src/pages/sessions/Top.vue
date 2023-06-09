<template>
  <Sessions-Feed :sessions="flattenedSessions" title="Top Sessions" />
</template>

<page-query>
  query {
    sessions: allTasting(sortBy: "rating", order: DESC) {
      edges {
        node {
          title
          date(format: "MMM DD, YYYY")
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
