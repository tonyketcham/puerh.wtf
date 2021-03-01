<template>
  <div
    class="flex w-full h-full gap-8 overflow-y-auto bg-gray-200 dark:bg-gray-800"
  >
    <aside class="hidden w-64 h-full flex-0 lg:block">
      <Sidebar-Nav />
    </aside>
    <div class="flex-auto">
      <SessionsFeed :title="$page.tags.title" :sessions="flattenedCategory" />
    </div>
  </div>
</template>

<page-query>
query Tags ($id: ID!) {
  tags(id: $id) {
    id
    title
    color
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
        return this.$page.tags.belongsTo.edges.flatMap(
          (session) => session.node
        );
      },
    },
  };
</script>
