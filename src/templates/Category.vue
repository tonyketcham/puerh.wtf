<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-auto">
      <SessionsFeed
        :title="$page.category.title"
        :sessions="flattenedCategory"
      />
    </div>
  </div>
</template>

<page-query>
query Category ($id: ID!) {
  category (id: $id) {
    title
    belongsTo {
      edges {
        node {
          ...on Style {
            title
            id
            belongsTo {
              edges {
                node {
                  ...on Tasting {
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
          }
        }
      }
    }
  }
}
</page-query>

<script>
  import SidebarNav from '@/components/Sidebar-Nav.vue';
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';

  export default {
    components: {
      SidebarNav,
      SessionsFeed,
    },
    computed: {
      flattenedCategory() {
        return this.$page.category.belongsTo.edges.flatMap((style) => {
          return style.node.belongsTo.edges.flatMap((session) => session.node);
        });
      },
      styles() {
        return this.$page.category.belongsTo.edges;
      },
    },
    methods: {
      styleHasSessions(sessions) {
        return sessions.length > 0;
      },
    },
  };
</script>
