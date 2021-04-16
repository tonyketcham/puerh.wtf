<template>
  <Sessions-Feed-Desktop
    v-if="viewport === 'desktop'"
    :title="title"
    :sessions="sessions"
  />
  <Sessions-Feed-Desktop v-else :title="title" :sessions="sessions" />
</template>

<script>
  import SessionsFeedDesktop from './desktop/Sessions-Feed-Desktop.vue';
  export default {
    components: {
      SessionsFeedDesktop,
    },
    props: {
      title: {
        type: String,
        default: 'Sessions',
      },
      sessions: null,
    },
    data() {
      return {
        viewport: 'mobile',
      };
    },
    mounted() {
      this.handleResize();
      window.addEventListener('resize', this.handleResize);
    },
    destroyed() {
      window.removeEventListener('resize', this.handleResize);
    },
    methods: {
      handleResize() {
        this.viewport = window.matchMedia('(max-width: 600px)').matches
          ? 'mobile'
          : window.matchMedia('(max-width: 800px)').matches
          ? 'tablet'
          : 'desktop';
      },
    },
  };
</script>
