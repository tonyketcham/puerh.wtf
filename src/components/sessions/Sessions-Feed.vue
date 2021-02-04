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
      <div class="flex flex-wrap gap-4">
        <Session-Card
          v-for="edge in sessions.edges"
          :key="edge.node.id"
          :info="edge.node"
          class="w-full sm:w-112"
        />
      </div>
    </section>
  </simplebar>
</template>

<script>
  import SessionCard from './Session-Card.vue';
  import simplebar from 'simplebar-vue';
  import 'simplebar/dist/simplebar.min.css';
  export default {
    components: {
      SessionCard,
      simplebar,
    },
    props: {
      sessions: null,
    },
  };
</script>
