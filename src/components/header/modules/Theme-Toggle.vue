<template>
  <button
    @click="toggleTheme"
    aria-label="Switch between light and dark mode"
    class="text-primary-dark focus:outline-none dark:text-yellow-300"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-6 h-6 fill-current"
    >
      <path fill="none" d="M0 0h24v24H0z" />
      <path
        v-if="theme === 'dark'"
        d="M16 20.334V18h-2v-4H3.332A9.511 9.511 0 0 1 3 11.5c0-4.56 3.213-8.37 7.5-9.289a8 8 0 0 0 11.49 9.724 9.505 9.505 0 0 1-5.99 8.4zM7 20h7v2H7v-2zm-5-4h10v2H2v-2z"
      />
      <path
        v-else
        d="M6.341 14A6 6 0 1 1 12 18v-4H6.341zM6
      20h9v2H6v-2zm-5-9h3v2H1v-2zm1 5h8v2H2v-2zm9-15h2v3h-2V1zM3.515
      4.929l1.414-1.414L7.05 5.636 5.636 7.05 3.515 4.93zM16.95
      18.364l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.121zm2.121-14.85l1.414
      1.415-2.121 2.121-1.414-1.414 2.121-2.121zM23 11v2h-3v-2h3z"
      />
    </svg>
  </button>
</template>

<script>
  import { mapGetters } from 'vuex';
  export default {
    computed: {
      ...mapGetters({ theme: 'getTheme' }),
    },
    methods: {
      toggleTheme() {
        this.$store.dispatch('toggleTheme');
      },
    },
  };
</script>
