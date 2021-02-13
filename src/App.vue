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
      Layout: () => import('~/layouts/Layout.vue'),
    },
    created() {
      this.$store.dispatch('initTheme');
    },
  };
</script>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  /* ::-webkit-scrollbar {
    @apply hidden;
  } */
</style>
