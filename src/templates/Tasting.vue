<template>
  <Layout>
    <section>
      <h1 class="text-6xl">{{ $page.tasting.title }}</h1>
      <span>{{ $page.tasting.date }}</span>
      <div>
        <h2>{{ $page.tasting.author[0].name }}</h2>
        <img :src="$page.tasting.author[0].image" alt="Author" />
      </div>

      <div>
        <ul class="m-3 space-y-2">
          <li v-for="note of $page.tasting.notes" :key="note">
            {{ note }}
          </li>
        </ul>
      </div>
      <div class="body" v-html="$page.tasting.content" />
    </section>
  </Layout>
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
        elevation
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
export default {};
</script>

<style lang="scss">
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
