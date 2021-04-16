<template>
  <section class="p-6">
    <h1 class="text-2xl">{{ title }}</h1>
    <table class="border-separate" style="border-spacing: 0 0.75rem">
      <thead class="overflow-hidden text-xs text-left">
        <tr
          class="text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-300"
        >
          <th class="rounded-l-2xl">Tea</th>
          <th class="w-24">Vendor</th>
          <th>Excerpt</th>
          <th class="rounded-r-2xl">Tags</th>
        </tr>
      </thead>
      <tbody>
        <Session-Card
          :info="session"
          :index="index"
          v-for="(session, index) in sessions"
          :key="session.id"
        />
      </tbody>
    </table>
  </section>
</template>

<script>
  import 'simplebar/dist/simplebar.min.css';

  export default {
    components: {
      SessionCard: () => import('./Session-Card-Desktop.vue'),
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

<style scoped>
  th {
    @apply py-3 px-4;
  }
</style>
