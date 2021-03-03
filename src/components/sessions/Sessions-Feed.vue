<template>
  <section class="flex-col h-full">
    <header
      class="flex justify-between p-6 align-middle bg-white lg:px-10 lg:pt-8 dark:bg-gray-800"
    >
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
        Sessions
      </h1>
      <nav class="my-auto space-x-2 tabs">
        <g-link to="/sessions/top/">Top</g-link>
        <g-link to="/sessions/latest/">Latest</g-link>
        <g-link to="/sessions/month/">Month</g-link>
        <g-link to="/sessions/year/">Year</g-link>
      </nav>
    </header>
    <div class="flex flex-wrap justify-start p-8 md:gap-4">
      <!-- <lazy-component> -->
      <Session-Card
        v-for="(edge, index) in sessions.edges"
        :key="edge.node.id"
        :info="edge.node"
        :index="index"
        class="w-full mb-4 md:mb-0"
      />
      <!-- </lazy-component> -->
    </div>
  </section>
</template>

<script>
  import 'simplebar/dist/simplebar.min.css';

  export default {
    components: {
      SessionCard: () => import('./Session-Card.vue'),
    },
    props: {
      sessions: null,
    },
  };
</script>
