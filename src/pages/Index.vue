<template>
  <Layout>
    <template slot="primary-block">
      <h1 class="mb-8 text-3xl font-black">
        <g-link to="/sessions/latest"> Latest Teas</g-link>
      </h1>
      <Slider seeMoreLink="/sessions/latest">
        <Card
          v-for="session in flattenedLatest"
          :key="session.id"
          :session="session"
        />
      </Slider>
    </template>

    <template slot="secondary-block">
      <h1 class="mb-3 text-3xl font-black">Tea Collection</h1>
      <small class="px-2 py-1 tracking-tight bg-gray-100 rounded-md max-w-max">
        by type
      </small>
      <!-- Chart -->
    </template>

    <template slot="tertiary-block">
      <h1
        class="
          mb-8
          text-3xl
          font-black
          transition-transform
          ease-out
          border-transparent
          max-w-max
          hover:translate-x-1.5
        "
      >
        <g-link to="/sessions/top">Favorites </g-link>
      </h1>
      <div class="lg:relative lg:h-56">
        <section
          class="overflow-x-hidden overflow-y-scroll  lg:absolute lg:inset-0 scrollbar"
        >
          <ul class="space-y-3">
            <li v-for="session in flattenedFavorites" :key="session.id">
              <div class="flex flex-row space-x-3 hover:bg-gray-50">
                <div
                  class="flex align-middle bg-gray-100 border-r-2 border-gray-600 rounded-l  w-14 h-14 group"
                  :style="`background-color: ${session.style[0].category.color}22;`"
                  :content="session.style[0].category.title"
                  v-tippy
                >
                  <div
                    class="w-3 h-3 m-auto transition-colors duration-150 border-2 border-black rounded-none  group-hover:border-yellow-900"
                    :style="`background-color: ${session.style[0].category.color}`"
                  />
                </div>
                <div class="flex flex-col">
                  <h2 class="space-x-1 text-lg font-medium tracking-tight">
                    <g-link :to="session.path">
                      <span class="font-bold text-gray-900">{{
                        session.production_year
                      }}</span>
                      {{ session.title }}
                    </g-link>
                  </h2>
                  <p class="text-gray-400 truncate w-72">
                    {{ session.excerpt }}
                  </p>
                </div>
              </div>
            </li>
            <li class="flex justify-end w-full p-4">
              <g-link to="/sessions/top" class="font-semibold">
                See more ->
              </g-link>
            </li>
          </ul>
        </section>
        <!-- <div
          class="absolute bottom-0 left-0 right-0 z-20 pointer-events-none bg-gradient-to-t from-white to-transparent lg:h-24"
        /> -->
      </div>
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
        title
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
    vendor {
      title
      path
      image
    }
  }
  query {
    latest: allTasting(limit: 5) {
      edges {
        node {
          ...sessionPreview
        }
      }
    }
    favorites: allTasting(limit: 5, sortBy: "rating") {
      edges {
        node {
          ...sessionPreview
        }
      }
    }
  }
</page-query>

<script>
  import { SITE_EMOJI, SITE_URL } from '@/lib/constants/brand';
  import Slider from '@/layouts/modules/Slider.vue';
  import SessionsFeed from '@/components/sessions/Sessions-Feed.vue';
  import Card from '@/components/sessions/Card.vue';

  export default {
    components: {
      SessionsFeed,
      Card,
      Slider,
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
