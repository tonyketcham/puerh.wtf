<template>
  <SessionsFeed :title="$page.tags.title" :sessions="flattenedCategory" />
</template>

<page-query>
  query Tags($id: ID!) {
    tags(id: $id) {
      id
      title
      color
      belongsTo {
        edges {
          node {
            ... on Tasting {
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
    }
  }
</page-query>

<script>
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';
  export default {
    components: {
      SessionsFeed,
    },
    computed: {
      flattenedCategory() {
        return this.$page.tags.belongsTo.edges.flatMap((session) => session.node);
      },
    },
  };
</script>
