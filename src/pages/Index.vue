<template>
  <Sessions-Feed :sessions="flattenedSessions" />
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
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';

  export default {
    components: {
      SessionsFeed,
    },
    metaInfo: {
      title: 'A Tea Log',
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
