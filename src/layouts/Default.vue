<template>
  <main
    class="min-h-screen text-gray-700 bg-gray-200 dark:bg-gray-800 dark:text-gray-50"
  >
    <Header />
    <!-- <div class="p-16 pt-24"> -->
    <slot />
    <!-- </div> -->
  </main>
</template>

<script>
  import { mapGetters } from 'vuex';
  import Header from '../components/Header.vue';

  export default {
    components: {
      Header,
    },
    beforeMount() {
      this.$store.dispatch('initTheme');
    },
    computed: {
      ...mapGetters({ theme: 'getTheme' }),
    },
    watch: {
      theme(newTheme) {
        newTheme === 'light'
          ? document.querySelector('html').classList.remove('dark')
          : document.querySelector('html').classList.add('dark');
      },
    },
  };
</script>
