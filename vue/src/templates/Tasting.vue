<template>
  <article
    class="grid w-full grid-flow-row grid-cols-12 space-x-6 space-y-6 grid-rows"
  >
    <div class="col-span-12 row-start-1 md:col-span-8">
      <div class="flex">
        <Author
          :name="$page.tasting.author[0].title"
          :image="$page.tasting.author[0].image"
          :date="$page.tasting.date"
          :path="$page.tasting.author[0].path"
          class="ml-1 max-w-max"
        />
        <h3 class="font-mono text-xs font-light opacity-30">
          {{ $page.tasting.date }}
        </h3>
      </div>
      <h1 class="text-6xl font-cursive">{{ $page.tasting.title }}</h1>
      <template v-if="$page.tasting.images.length > 0">
        <div
          class="relative w-full mt-6 overflow-hidden rounded-lg shadow h-96"
        >
          <g-image
            v-for="node in $page.tasting.images"
            :key="node.image"
            :src="node.image"
            :alt="node.alt"
            class="absolute inset-0 object-cover w-full h-full"
          />
        </div>
      </template>
    </div>
    <aside
      class="flex flex-row h-full col-span-12 row-span-2 row-start-2  md:sticky md:top-0 md:row-start-1 md:col-span-4"
    >
      <Flavor-Chart
        class="mt-2.5 self-start align-middle"
        :flavor_axes="$page.tasting.flavor_axes"
      />
      <Experience-Notes
        class="self-start w-full align-middle md:w-2/3"
        :notes="$page.tasting.notes"
      />
    </aside>

    <!-- white-space: break-spaces; -->
    <div
      class="col-span-12 row-start-4 md:row-start-2 md:col-span-8 body"
      :class="[
        $page.tasting.images.length === 0
          ? 'pt-5 border-t-2 border-gray-400 dark:border-gray-500 border-dashed'
          : '',
      ]"
      v-html="insertLineBreaks($page.tasting.content)"
    />
  </article>
</template>

<page-query>
  query Tasting($id: ID!) {
    tasting(id: $id) {
      id
      path
      date(format: "MM/DD/YYYY")
      author {
        path
        title
        image
      }
      title
      excerpt
      images {
        image
        alt
      }
      rating
      style {
        title
        category {
          title
        }
      }
      cultivar {
        title
      }
      season
      production_year
      origin {
        location
        municipality
        country
      }
      tags {
        title
        path
        color
      }
      brewing {
        temperature
        material_amount
        vessel
        liquid_amount
        first_infusion_duration
        infusion_increment
      }
      flavor_axes {
        vegetal {
          start
          finish
        }
        floral {
          start
          finish
        }
        fruits {
          start
          finish
        }
        spices {
          start
          finish
        }
        earth {
          start
          finish
        }
        wood {
          start
          finish
        }
        nuts_roast {
          start
          finish
        }
        cream {
          start
          finish
        }
        stone {
          start
          finish
        }
        umami {
          start
          finish
        }
      }
      notes {
        dry_leaf_nose
        wet_leaf_nose
        mouthfeel
        taste
        finish
        empty_cup
        cha_qi
      }
      content
    }
  }
</page-query>

<script>
  import { imagePathReducer } from '@/lib/reducers/images';
  import { SITE_EMOJI, SITE_URL } from '@/lib/constants/brand';

  export default {
    metaInfo() {
      return {
        title: this.$page.tasting.title,
        meta: [
          {
            property: 'og:title',
            content: `Tasting ${this.$page.tasting.title} ${SITE_EMOJI}`,
            vmid: 'og:title',
          },
          {
            property: 'og:url',
            content: SITE_URL + this.$page.tasting.path,
            vmid: 'og:title',
          },
          {
            property: 'og:type',
            content: 'article',
            vmid: 'og:type',
          },
          {
            property: 'og:image',
            content:
              `https://og-image-navy.vercel.app/${this.$page.tasting.title}.jpeg?theme=light&md=1&fontSize=150px&images=https%3A%2F%2Fpuerh.wtf%2Fassets%2Fstatic%2Fapple-touch-icon.7b22250.d6c38f098e4cfe7492d30929042211dd.png&widths=undefined&heights=undefined` +
              this.ogImageInjection(),
            vmid: 'og:image',
          },
          {
            property: 'og:description',
            content: this.$page.tasting.excerpt,
            vmid: 'og:description',
          },
          {
            property: 'article:published_time',
            content: new Date(this.$page.tasting.date).toISOString(),
          },
          {
            property: 'article:tag',
            content: this.$page.tasting.tags.flatMap((tag) => tag.title),
            vmid: 'article:tag',
          },
          {
            name: 'author',
            content: this.$page.tasting.author[0].title,
          },
          {
            name: 'description',
            content: this.$page.tasting.excerpt,
          },
        ],
        link: [
          {
            rel: 'canonical',
            href: SITE_URL + this.$page.tasting.path,
          },
        ],
      };
    },
    components: {
      Author: () => import('../components/Author.vue'),
      ExperienceNotes: () => import('@/components/tea/Experience-Notes.vue'),
      FlavorChart: () => import('@/components/tea/Flavor-Chart.vue'),
    },
    methods: {
      ogImageInjection() {
        return this.$page.tasting.images[0]
          ? `&images=${imagePathReducer(
              this.$page.tasting.images[0]?.image
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

<style lang="scss">
  dd {
    @apply text-gray-600 dark:text-gray-300;
  }
  .body {
    h3 {
      @apply text-4xl pt-3 pb-2 text-gray-700 dark:text-white border-b-2 border-dashed border-gray-400 dark:border-gray-500;
    }
    a {
      @apply border-b-2 border-dashed border-indigo-500 transition-colors duration-300 ease-in-out font-semibold tracking-wide;
    }
    a:hover {
      @apply border-yellow-500 dark:border-yellow-400 text-indigo-700 dark:text-indigo-300;
    }
    blockquote {
      @apply my-4 pl-3 pr-1 py-1 border-l-2 rounded-r-lg border-yellow-600 bg-gray-50 dark:bg-gray-900 dark:border-yellow-400;
    }
    ol {
      @apply p-5 space-y-3;
      li {
        @apply list-decimal list-outside px-2;
      }
      li::marker {
        @apply text-yellow-600 dark:text-yellow-300 text-xl;
      }
    }
  }
</style>
