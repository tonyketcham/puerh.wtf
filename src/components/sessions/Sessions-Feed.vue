<template>
  <section class="flex-col p-6 lg:p-16">
    <header class="flex justify-between mb-6">
      <h1 class="text-2xl">{{ title }}</h1>
      <nav class="space-x-2 tabs">
        <g-link v-if="false" to="/sessions/month/">Month</g-link>
        <g-link v-if="false" to="/sessions/year/">Year</g-link>
      </nav>
    </header>
    <div class="flex flex-col flex-wrap md:gap-4">
      <lazy-component v-for="(session, index) in sessions" :key="session.id">
        <Session-Card :info="session" :index="index" class="" />
      </lazy-component>
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
      title: {
        type: String,
        default: 'Sessions',
      },
      sessions: null,
    },
  };
</script>
