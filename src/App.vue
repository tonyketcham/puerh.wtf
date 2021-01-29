<template>
  <Layout>
    <router-view />
  </Layout>
</template>

<static-query>
query {
  metadata {
    siteName
    siteDescription
  }
}
</static-query>

<script>
  import { mapGetters } from 'vuex';
  import Layout from '~/layouts/Layout.vue';

  export default {
    metaInfo() {
      return {
        title: this.$static.metadata.siteName,
        meta: [
          {
            key: 'description',
            name: 'description',
            content: this.$static.metadata.siteDescription,
          },
        ],
      };
    },
    components: {
      Layout,
    },
    created() {
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
