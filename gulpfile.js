const {src, dest, task, series, parallel} = require('gulp')
const webpack = require('webpack-stream')
const less = require('gulp-less')
const autoprefix = require('gulp-autoprefixer')
const uglify = require('gulp-uglify')
const minifyCSS = require('gulp-csso')
const zip = require('gulp-zip')
const rename = require('gulp-rename')
const clean = require('gulp-clean')
const path = require('path')
const execSync = require('child_process').execSync
const fs = require('fs')
const resolve = (name) => path.resolve(__dirname, name)
const cssPath = './templates/assets/css'
const jsPath = './templates/assets/js'
const distPath = './dist'
const devModel = process.env.npm_config_devel
let version = process.env.npm_config_tag

if (devModel) {
  console.log('> 开发模式')
}
version && console.log(`> 发布版本：${version}`)

task('clean', () => {
  return src([cssPath, jsPath, distPath], {
    read: false,
    allowEmpty: true,
  }).pipe(
    clean({
      force: true,
    })
  )
})

//生成测试版本号
task('generate', (done) => {
  // 生成格式化的时间戳 (yyyyMMddHHmmss)
  const pad = n => n.toString().padStart(2, '0')
  const now = new Date()
  version = '0.0.' + [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
  done()
})

task('version', (done) => {
  if (version == null) {
    console.log('[Version] No \'--tag\' parameters are specified')
    done()
    return
  }
  const themePath = 'theme.yaml'
  const packagePath = 'package.json'
  const themeData = fs.readFileSync(themePath, 'utf8')
    .replace(/^(\s+version:)\s+[^\s]+$/m, '$1 ' + version)
  fs.writeFileSync(themePath, themeData)
  let packageData = fs.readFileSync(packagePath, 'utf8')
    .replace(/"version":\s*"[^"]+"/, `"version": "${version}"`)
  fs.writeFileSync(packagePath, packageData)
  done()
})

task('css', () => {
  const ignoreFiles = [].map((file) => `./src/css/${file}.less`)

  let gw = src('./src/css/**/*.less', {
    ignore: ignoreFiles,
  })
    .pipe(less())
    .pipe(
      autoprefix({
        overrideBrowserslist: ['> 2%', 'last 2 versions', 'not ie 6-9'],
        cascade: false,
      })
    )
  if (!devModel) {
    gw = gw.pipe(minifyCSS())
  }

  return gw.pipe(
    rename({
      suffix: '.min',
    })
  ).pipe(dest(cssPath))
})

task('js', () => {
  const readFile = (prefix, dir, ignoreFiles) => {
    let result = {}
    let files = fs.readdirSync(dir, 'utf-8')
    files.forEach((file) => {
      let filePath = path.join(dir, file)
      let states = fs.statSync(filePath)
      if (states.isDirectory()) {
        Object.assign(result, readFile(path.join(prefix, file), filePath, ignoreFiles))
      } else if (ignoreFiles.length
        ? /\.js$/.test(file) && !ignoreFiles.includes(path.join(prefix, file))
        : /\.js$/.test(file)) {
        const fileName = file.replace(/.js$/, '')
        result[path.join(prefix, fileName)] = resolve(filePath)
      }
    })
    return result
  }
  const getEntryData = () => {
    return readFile('', './src/js', [])
  }

  return webpack({
    mode: devModel ? 'development' : 'production',
    entry: getEntryData(),
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader',
          include: resolve('source'),
          exclude: resolve('node_modules'),
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime'],
          },
        },
      ],
    },
    stats: 'errors-only',
    output: {
      filename: '[name].min.js',
    },
  })
    .pipe(uglify())
    .pipe(dest(jsPath))
})

task('zip', () => {
  const target = ['./templates/**', './*.yaml', 'README.md', 'LICENSE']
  return src(target, {base: '.'})
    .pipe(zip('theme-dream2-plus' + (version ? ('-' + version) : '') + '.zip'))
    .pipe(dest(distPath))
})

task('publish', (done) => {
  try {
    // 需要将tag标签内容置为 latest
    process.env.npm_config_tag = 'latest'
    console.log(execSync('npm publish').toString())
    done()
  } catch (error) {
    console.error('发布失败:', error.message)
    done(error)
  }
})

// 默认模式
task('default', series('clean', parallel('css', 'js'), 'zip'))

// release模式，需要使用--tag参数指定版本号
task('release', series('clean', 'version', parallel('css', 'js'), 'zip'))

// build-res模式，用于编译特定版本资源，在工作流中发布npm使用，需要使用--tag参数指定版本号
task('build-res', series('clean', 'version', parallel('css', 'js')))

//根据执行时间打包生成“0.0.yyyyMMddHHmmss”格式的版本号，用于测试环境安装调试
task('dev', series('clean', 'generate', 'version', parallel('css', 'js'), 'zip'))

// push模式，需要使用--tag参数指定版本号
task('push', series('clean', 'version', parallel('css', 'js'), 'zip', 'publish'))
