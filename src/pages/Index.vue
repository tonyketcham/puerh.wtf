<template>
  <Layout>
    <template slot="primary-block">
      <h1 class="text-3xl font-black">
        Latest Teas
        <!-- <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="inline h-8 text-gray-400 fill-current w-9"
        >
          <path fill="none" d="M0 0h24v24H0z" />
          <path
            d="M14.59 16.004L5.982 7.397l1.414-1.414 8.607 8.606V7.004h2v11h-11v-2z"
          />
        </svg> -->
      </h1>
    </template>

    <template slot="secondary-block">
      <h1 class="mb-3 text-3xl font-black">Tea Collection</h1>
      <small class="px-2 py-1 tracking-tight bg-gray-100 rounded-md max-w-max">
        by type
      </small>
      <!-- Chart -->
    </template>

    <template slot="tertiary-block">
      <h1 class="max-w-lg mb-8 text-3xl font-black">Favorites</h1>
      <ul class="space-y-8">
        <li v-for="session in flattenedFavorites" :key="session.id">
          <div class="flex flex-row space-x-6">
            <div
              class="flex w-12 h-12 align-middle bg-gray-100 border-r-2 border-gray-600 rounded-l "
              :style="`background-color: ${session.style[0].category.color}22;`"
            >
              <div
                class="w-3 h-3 m-auto border-2 border-black"
                :style="`background-color: ${session.style[0].category.color}`"
              />
            </div>
            <div class="flex flex-col">
              <h2 class="space-x-1 text-lg font-medium tracking-tight">
                <span class="font-bold text-gray-900">{{
                  session.production_year
                }}</span>
                <g-link :to="session.path">{{ session.title }} </g-link>
              </h2>
              <p class="text-gray-400 truncate w-72">{{ session.excerpt }}</p>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <!-- <template slot="quaternary-block">
 
    </template> -->
  </Layout>
</template>

<page-query>
  fragment sessionPreview on Tasting {
    title
    date(format: "MMM DD, YYYY")
    path
    id
    excerpt
    production_year
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
  query {
    latest: allTasting(limit: 3) {
      edges {
        node {
          ...sessionPreview
        }
      }
    }
    favorites: allTasting(limit: 3, sortBy: "rating") {
      edges {
        node {
          ...sessionPreview
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
              'Data-driven log of teas with a focus on exploring the world of raw pu-erh and terroir.',
            vmid: 'og:description',
          },
          {
            name: 'description',
            content:
              'Data-driven log of teas with a focus on exploring the world of raw pu-erh and terroir.',
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
      flattenedLatest() {
        return this.$page?.latest.edges.flatMap((session) => {
          return session.node;
        });
      },
      flattenedFavorites() {
        return this.$page?.favorites.edges.flatMap((session) => {
          return session.node;
        });
      },
    },

    data() {
      return {
        heroTagline: '',
        heroExcerpt: '',
      };
    },
  };
</script>
