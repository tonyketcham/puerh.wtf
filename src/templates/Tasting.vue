<template>
  <article
    class="grid w-full h-full grid-flow-row grid-cols-12 gap-6 p-6 overflow-y-scroll grid-rows"
  >
    <div class="col-span-12 row-start-1 md:col-span-8">
      <div class="flex">
        <Author
          :name="$page.tasting.author[0].title"
          :image="$page.tasting.author[0].image"
          :date="$page.tasting.date"
          class="ml-1 max-w-max"
        />
        <h3 class="font-mono text-xs font-light opacity-30">
          {{ $page.tasting.date }}
        </h3>
      </div>
      <h1 class="text-6xl">{{ $page.tasting.title }}</h1>
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
      class="relative flex flex-row h-full col-span-12 row-span-2 row-start-2 md:row-start-1 md:col-span-4"
    >
      <Flavor-Chart
        class="mt-2.5 md:sticky md:top-0 align-middle self-start"
        :flavor_axes="$page.tasting.flavor_axes"
      />
      <Experience-Notes
        class="self-start w-full align-middle md:w-2/3 md:sticky md:top-0"
        :notes="$page.tasting.notes"
      />
    </aside>

    <!-- white-space: break-spaces; -->
    <div
      class="col-span-12 row-start-4 pt-5 border-t-2 border-gray-600 border-dashed md:row-start-2 md:col-span-8 dark:border-gray-400 body border-opacity-40"
      v-html="insertLineBreaks($page.tasting.content)"
    />
  </article>
</template>

<page-query>
query Tasting ($id: ID!) {
  tasting(id: $id) {
        id
        date (format: "MM/DD/YYYY")
        author {
          title
          image
        }
        title
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
  export default {
    components: {
      Author: () => import('../components/Author.vue'),
      ExperienceNotes: () => import('@/components/tea/Experience-Notes.vue'),
      FlavorChart: () => import('@/components/tea/Flavor-Chart.vue'),
    },
    methods: {
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
      @apply text-3xl;
    }
    ol {
      @apply p-5 space-y-3;
      li {
        @apply list-decimal list-outside;
      }
    }
  }
</style>
