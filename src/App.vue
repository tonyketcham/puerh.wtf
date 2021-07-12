<template>
  <router-view />
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
    mounted() {
      this.$store.dispatch('initTheme');
    },
  };
</script>

<style lang="postcss">
  /* Hide scrollbar for Chrome, Safari and Opera */
  /* ::-webkit-scrollbar {
    @apply hidden;
  } */
  @font-face {
    font-family: 'Lexend';
    src: local('Lexend'),
      url('../static/fonts/Lexend/Lexend.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Caveat';
    src: local('Caveat'),
      url('../static/fonts/Caveat/Caveat-VariableFont_wght.woff2')
        format('woff2');
    font-variation-settings: 'wght' 375;
  }

  /* font-variation-settings: 'wght' 375, 'GRAD' 88; */
</style>
