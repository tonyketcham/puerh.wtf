<template>
  <article
    class="grid w-full h-full grid-flow-row gap-6 p-6 overflow-y-scroll  grid-rows"
  >
    <div class="col-span-12 row-start-1 md:col-span-6">
      <div class="flex">
        <template v-if="$page.author.image">
          <div
            class="relative w-48 h-48 mt-6 overflow-hidden shadow-xl  rounded-3xl ring-4 ring-yellow-300"
          >
            <g-image
              :src="$page.author.image"
              :alt="`${$page.author.title}'s avatar`"
              class="absolute inset-0 object-cover w-full h-full rounded-3xl"
            />
            <div
              class="absolute inset-0 w-full h-full  bg-gradient-to-bl from-yellow-400 to-transparent via-transparent opacity-70 rounded-3xl"
            />
          </div>
        </template>
        <div class="z-10 flex flex-col">
          <h1 class="-mt-1 -ml-20 font-semibold text-8xl text-shadow-xl">
            {{ $page.author.title }}
          </h1>
          <Social-Links :links="$page.author.links" />
        </div>
      </div>
    </div>

    <aside
      class="flex flex-col h-full col-span-12 row-start-2  md:col-span-5 md:sticky md:top-0 md:row-start-1"
    >
      <h2 class="text-3xl font-semibold">Session Stats</h2>
      <div class="my-3">
        <h3 class="text-2xl border-b-2">Tea Production Years</h3>
        <div class="m-2">
          <div class="flex justify-between">
            <h4 class="font-semibold">Youngest:</h4>
            <span>{{ Math.max(...getProductionYearsArray) }}</span>
          </div>
          <div class="flex justify-between">
            <h4 class="font-semibold">Average:</h4>
            <Average :years="getProductionYearsArray" />
          </div>
          <div class="flex justify-between">
            <h4 class="font-semibold">Oldest:</h4>
            <span>{{ Math.min(...getProductionYearsArray) }}</span>
          </div>
        </div>
      </div>
    </aside>

    <div class="col-span-12 row-start-3 md:row-start-2">
      <Sessions-Feed :sessions="flattenedSessions" title="Recent Sessions" />
    </div>
  </article>
</template>

<page-query>
  query Author($id: ID!) {
    author(id: $id) {
      id
      path
      title
      excerpt
      image
      links {
        website
        instagram
        github
      }
      belongsTo {
        edges {
          node {
            ... on Tasting {
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
          }
        }
      }
    }
  }
</page-query>

<script>
  import { imagePathReducer } from '@/lib/reducers/images';
  import { SITE_EMOJI, SITE_URL } from '@/lib/constants/brand';

  export default {
    metaInfo() {
      return {
        title: this.$page.author.title,
        meta: [
          {
            property: 'og:title',
            content: `Tasting ${this.$page.author.title} ${SITE_EMOJI}`,
            vmid: 'og:title',
          },
          {
            property: 'og:url',
            content: SITE_URL + this.$page.author.path,
            vmid: 'og:title',
          },
          //   {
          //     property: 'og:type',
          //     content: 'article',
          //     vmid: 'og:type',
          //   },
          {
            property: 'og:image',
            content:
              `https://og-image-navy.vercel.app/${this.$page.author.title}.jpeg?theme=light&md=1&fontSize=150px&images=https%3A%2F%2Fpuerh.wtf%2Fassets%2Fstatic%2Fapple-touch-icon.7b22250.d6c38f098e4cfe7492d30929042211dd.png&widths=undefined&heights=undefined` +
              this.ogImageInjection(),
            vmid: 'og:image',
          },
          {
            property: 'og:description',
            content: this.$page.author.excerpt,
            vmid: 'og:description',
          },
          {
            name: 'author',
            content: this.$page.author.title,
          },
          {
            name: 'description',
            content: this.$page.author.excerpt,
          },
        ],
        link: [
          {
            rel: 'canonical',
            href: SITE_URL + this.$page.author.belongsTo.path,
          },
        ],
      };
    },
    components: {
      SocialLinks: () => import('@/components/profile/Social-Links.vue'),
      Average: () => import('@/components/profile/Average.vue'),
      SessionsFeed: () => import('@/components/sessions/Sessions-Feed.vue'),
    },

    computed: {
      getProductionYearsArray() {
        return this.$page.author.belongsTo.edges.flatMap(
          (session) => session.node.production_year
        );
      },
      flattenedSessions() {
        return this.$page.author.belongsTo.edges.flatMap((session) => {
          return session.node;
        });
      },
    },

    methods: {
      ogImageInjection() {
        return this.$page.author.image
          ? `&images=${imagePathReducer(
              this.$page.author?.image
            )}&widths=350&heights=350`
          : '';
      },
      insertLineBreaks(content) {
        if (!content) return '';
        const stringifiedContent = content.toString();
        return stringifiedContent.replace(/\\/g, '<br/>');
      },
    },
  };
</script>
