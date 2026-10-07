Pod::Spec.new do |s|
  s.name           = 'YerimMapKit'
  s.version        = '1.0.0'
  s.summary        = 'Apple Maps parking search for Yerim Var'
  s.description    = 'Finds car parks near a point with MKLocalPointsOfInterestRequest.'
  s.author         = ''
  s.homepage       = 'https://github.com/patrickgt966-art/yerim-var-'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
