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
  import { SITE_EMOJI, SITE_URL } from '@/lib/constants/brand';

  export default {
    components: {
      SessionsFeed,
    },
    metaInfo() {
      return {
        title: 'A Tea Log',
        meta: [
          {
            property: 'og:title',
            content: `A guide to drinkin' the good stuff ${SITE_EMOJI}`,
            vmid: 'og:title',
          },
          {
            property: 'og:description',
            content:
              'Data-driven log of teas with a focus towards exploring the world of raw pu-erh and terroir.',
            vmid: 'og:description',
          },
          {
            name: 'description',
            content:
              'Data-driven log of teas with a focus towards exploring the world of raw pu-erh and terroir.',
          },
          {
            property: 'og:url',
            content: SITE_URL,
            vmid: 'og:title',
          },
          {
            property: 'og:image',
            content:
              'https://og-image-navy.vercel.app/A%20tea%20log.jpeg?theme=dark&md=1&fontSize=150px&images=https%3A%2F%2Fpuerh.wtf%2Fassets%2Fstatic%2Fapple-touch-icon.7b22250.d6c38f098e4cfe7492d30929042211dd.png',
            vmid: 'og:image',
          },
        ],
      };
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
