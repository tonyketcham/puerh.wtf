<template>
  <div>
    <h1 class="text-6xl">{{ $page.tasting.title }}</h1>
    <span>{{ $page.tasting.date }}</span>

    <Author
      :name="$page.tasting.author[0].name"
      :image="$page.tasting.author[0].image"
    />
    <template v-if="$page.tasting.images">
      <g-image
        v-for="node in $page.tasting.images"
        :key="node.image"
        :src="node.image"
        :alt="node.alt"
      />
    </template>

    <Experience-Notes :notes="$page.tasting.notes" />
    <div class="body" v-html="$page.tasting.content" />
  </div>
</template>

<page-query>
query Tasting ($id: ID!) {
  tasting(id: $id) {
        id
        date
        author {
          name
          image
        }
        title
        images {
          image
          alt
        }
        rating
        style {
          name
          category {
            name
          }
        }
        cultivar {
          name
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
  import ExperienceNotes from '@/components/tea/Experience-Notes.vue';
  import Author from '../components/Author.vue';
  export default {
    components: {
      Author,
      ExperienceNotes,
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
