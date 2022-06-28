<template>
  <nav
    class="flex flex-wrap text-lg font-semibold transition-all duration-300  gap-x-8 gap-y-2 decoration-clone"
    :class="{
      'text-white bg-black px-2 py-1 rounded-lg justify-center': forceDarkMode,
    }"
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
