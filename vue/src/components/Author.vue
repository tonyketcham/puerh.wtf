<template>
  <div class="relative flex items-baseline">
    <g-link :to="path" class="z-10">
      <g-image :src="image" blur="40" alt="Author" class="rounded-lg shadow h-7 w-7" />
    </g-link>

    <h2
      class="
        bg-gray-700
        dark:bg-gray-300
        text-gray-200
        dark:text-gray-700
        px-1.5
        rounded
        pl-5
        -ml-4
        mr-0.5
        text-base
        font-medium
      "
    >
      <g-link :to="path">
        {{ name }}
      </g-link>
    </h2>
  </div>
</template>

<script>
  export default {
    props: {
      name: {
        type: String,
        default: 'Author Name',
      },
      image: {
        type: String,
        default: '#',
      },
      date: {
        type: String,
        default: '',
      },
      path: {
        type: String,
        default: '/',
      },
    },
  };
</script>
