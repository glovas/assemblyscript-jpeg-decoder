module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-exec');

    grunt.initConfig({
        exec: {
        wasm: 'asc jpeg-decode.ts -o jpeg-decode.wasm'  
        },
        watch: {
            files: ['jpeg-decode.ts'],
            tasks: ['exec:wasm']
        },
    });
    
    grunt.registerTask('default', ['watch']);
};