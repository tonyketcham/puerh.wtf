<template>
  <nav
    class="flex flex-wrap space-x-8 text-lg font-semibold transition-all duration-300  decoration-clone"
    :class="{ 'text-white': forceDarkMode }"
  >
    <g-link to="/">Overview</g-link>
    <g-link to="/sessions/latest">Latest</g-link>
    <g-link to="/sessions/top">Top</g-link>
    <g-link to="/about">About</g-link>
    <!-- <g-link to="/">Explore</g-link> -->
  </nav>
</template>

<script>
  export default {
    props: {
      forceDarkMode: Boolean,
    },
  };
</script>
