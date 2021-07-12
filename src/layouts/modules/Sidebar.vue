<template>
  <dl>
    <div>
      <dt>Teas</dt>
      <dd>{{ $static.Teas.totalCount }}</dd>
    </div>
    <div>
      <dt>Origins</dt>
      <dd>{{ $static.Origins.totalCount }}</dd>
    </div>
    <div>
      <dt>Styles</dt>
      <dd>{{ $static.Styles.totalCount }}</dd>
    </div>
    <div>
      <dt>Types</dt>
      <dd>{{ $static.Types.totalCount }}</dd>
    </div>
    <div>
      <dt>Vendors</dt>
      <dd>{{ $static.Vendors.totalCount }}</dd>
    </div>
    <div>
      <dt>Authors</dt>
      <dd>{{ $static.Authors.totalCount }}</dd>
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

<style lang="scss" scoped>
  dl {
    @apply space-y-6;

    div {
      dt {
        @apply text-gray-400 text-lg tracking-tight;
      }
      dd {
        @apply font-black text-black text-3xl tracking-tight cursor-pointer max-w-max;
      }
    }
  }
</style>
