<template>
  <nav class="p-16 pr-0 space-y-3 text-lg">
    <g-link to="/about/" class="link"><span>🗿</span>Stone</g-link>
    <g-link to="/about/" class="link"><span>🧤</span>Excalibur</g-link>
    <g-link to="/about/" class="link"><span>😻</span>Tickle</g-link>
    <g-link to="/about/" class="link"><span>🥦</span>Whole Grain</g-link>
  </nav>
</template>

<script>
  export default {};
</script>

<style scoped>
  span {
    @apply mr-2 text-2xl;
  }
  .link {
    @apply block;
  }
  .link:hover {
    @apply bg-indigo-200 text-gray-900;
  }
</style>
