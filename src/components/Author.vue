<template>
  <div class="relative flex items-baseline">
    <g-image
      :src="image"
      blur="40"
      alt="Author"
      class="z-10 rounded-lg shadow h-7 w-7"
    />
    <h2
      class="bg-gray-700 dark:bg-gray-300 text-gray-200 dark:text-gray-700 px-1.5 rounded pl-5 -ml-4 mr-0.5 text-base font-medium"
    >
      {{ name }}
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
    },
  };
</script>
