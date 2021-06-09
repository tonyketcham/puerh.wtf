<template>
  <section class="flex-col">
    <Title>{{ title }}</Title>
    <div class="flex flex-col space-y-6">
      <lazy-component v-for="(session, index) in sessions" :key="session.id">
        <Session-Card :info="session" :index="index" />
      </lazy-component>
    </div>
  </section>
</template>

<script>
  import 'simplebar/dist/simplebar.min.css';
  import Title from '../utility/layout/Title.vue';

  export default {
    components: {
      SessionCard: () => import('./Session-Card.vue'),
      Title,
    },
    props: {
      title: {
        type: String,
        default: 'Session Log',
      },
      sessions: null,
    },
  };
</script>
