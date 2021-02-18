<template>
  <simplebar class="h-full">
    <section class="flex-col p-6 lg:p-16">
      <header class="flex justify-between mb-6">
        <h1 class="text-2xl">Sessions</h1>
        <nav class="space-x-2 tabs">
          <g-link to="/sessions/top/">Top</g-link>
          <g-link to="/sessions/latest/">Latest</g-link>
          <g-link to="/sessions/month/">Month</g-link>
          <g-link to="/sessions/year/">Year</g-link>
        </nav>
      </header>
      <div class="flex flex-col flex-wrap md:gap-4 md:flex-row">
        <lazy-component
          v-for="(edge, index) in sessions.edges"
          :key="edge.node.id"
        >
          <Session-Card
            :info="edge.node"
            :index="index"
            class="w-full mb-4 sm:w-112 md:mb-0"
          />
        </lazy-component>
      </div>
    </section>
  </simplebar>
</template>

<script>
  import 'simplebar/dist/simplebar.min.css';

  export default {
    components: {
      SessionCard: () => import('./Session-Card.vue'),
      simplebar: () => import('simplebar-vue'),
    },
    props: {
      sessions: null,
    },
  };
</script>
