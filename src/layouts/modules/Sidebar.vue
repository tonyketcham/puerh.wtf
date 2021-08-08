<template>
  <dl>
    <div v-for="(property, index) of $static" :key="index">
      <dt>
        {{ index }}
      </dt>
      <dd>
        {{ property.totalCount }}
      </dd>
    </div>
  </dl>
</template>

<static-query>
  query {
    Teas: allTasting {
      totalCount
    }
    Styles: allStyle {
      totalCount
    }
    Types: allCategory {
      totalCount
    }
    Origins: allOrigin {
      totalCount
    }
    Vendors: allVendor {
      totalCount
    }
    Authors: allAuthor {
      totalCount
    }
  }
</static-query>

<script>
  export default {};
</script>

<style scoped>
  dl {
    @apply flex lg:block flex-wrap justify-around space-y-0 lg:space-y-6;
  }
  div {
    @apply flex-grow w-20;
  }
  dt {
    @apply text-lg tracking-tight;
  }
  dd {
    @apply font-black text-3xl tracking-tight cursor-pointer max-w-max text-black;
  }
</style>
