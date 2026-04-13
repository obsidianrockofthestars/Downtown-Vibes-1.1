/**
 * EAS / CI: Maven Central often returns 429 Too Many Requests for shared IPs.
 * Prefer Google's mirror of Maven Central for plugin + dependency resolution.
 * @see https://storage.googleapis.com/maven-central/
 */
const { withSettingsGradle } = require('expo/config-plugins');

const MIRROR_MARKER = 'maven-central.storage-download.googleapis.com';

function withGradleMavenMirror(config) {
  return withSettingsGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(MIRROR_MARKER)) {
      return modConfig;
    }

    const injected = `pluginManagement {
  repositories {
    google()
    maven {
      url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
    }
    mavenCentral()
    gradlePluginPortal()
  }

  def reactNativeGradlePlugin`;

    if (!contents.includes('def reactNativeGradlePlugin')) {
      return modConfig;
    }

    contents = contents.replace(
      /pluginManagement \{\s*\n\s*def reactNativeGradlePlugin/,
      injected
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = withGradleMavenMirror;
