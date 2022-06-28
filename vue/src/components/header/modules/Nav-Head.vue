<template>
  <nav class="justify-center hidden space-x-6 md:flex">
    <ul class="flex space-x-3">
      <li class="flex" v-for="link in links" :key="link.title">
        <g-link :to="link.to" class="link uniform-transition">
          <svg
            v-if="link.path"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            class="w-5 h-5 fill-current"
          >
            <path fill="none" d="M0 0h24v24H0z" />
            <path :d="link.path" />
          </svg>
          <span>{{ link.title }}</span>
        </g-link>
      </li>
    </ul>
  </nav>
</template>
<script>
  export default {
    data() {
      return {
        links: [
          {
            title: 'Top Sessions',
            to: '/sessions/top/',
            path: 'M12 7a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 3.5l-1.323 2.68-2.957.43 2.14 2.085-.505 2.946L12 17.25l2.645 1.39-.505-2.945 2.14-2.086-2.957-.43L12 10.5zm1-8.501L18 2v3l-1.363 1.138A9.935 9.935 0 0 0 13 5.049L13 2zm-2 0v3.05a9.935 9.935 0 0 0-3.636 1.088L6 5V2l5-.001z',
          },
          {
            title: 'Latest Sessions',
            to: '/sessions/latest/',
            path: 'M16 20V4H4v15a1 1 0 0 0 1 1h11zm3 2H5a3 3 0 0 1-3-3V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h4v9a3 3 0 0 1-3 3zm-1-10v7a1 1 0 0 0 2 0v-7h-2zM6 6h6v6H6V6zm2 2v2h2V8H8zm-2 5h8v2H6v-2zm0 3h8v2H6v-2z',
          },
          // { title: 'Sessions', to: '/sessions/' },
          // { title: 'Categories', to: '/categories/' },
          // { title: 'Vendors', to: '/vendors/' },
          {
            title: 'What is this?',
            to: '/about/',
            path: 'M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12zM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12zm6.96 9H7.66l6.552-18h2.128L9.788 21z',
          },
        ],
      };
    },
  };
</script>

<style scoped lang="postcss">
  .link {
    @apply flex items-center space-x-1 bg-yellow-50 dark:bg-gray-900 px-2 py-0.5;
  }
  .active {
    @apply dark:text-white text-black;
  }
</style>
