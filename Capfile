load 'deploy' if respond_to?(:namespace) # cap2 differentiator

default_run_options[:pty] = true

set :application, "node"
set :scm, :git
set :repository, "git@github.com:siggy/heypic.js.git"
set :branch, "master"

set :use_sudo, false
set :user, "deploy"

ssh_options[:keys] = [File.expand_path('../../siggy_key_01.pem', __FILE__)]

role :web,      "heypic.me"
role :memcache, "heypic.me"
role :redis,    "heypic.me"
role :db,       "heypic.me", :primary => true

set(:deploy_to) { "/usr/local/heypic" }

namespace :deploy do
  task :migrate do
    # no-op
  end

  task :start do
    run "sudo monit start heypic_streamer"
    run "sudo monit start heypic_processor"
    run "sudo monit start heypic_server"
  end

  task :stop do
    run "sudo monit stop heypic_streamer"
    run "sudo monit stop heypic_processor"
    run "sudo monit stop heypic_server"
  end

  task :restart do
    run "sudo monit restart heypic_streamer"
    run "sudo monit restart heypic_processor"
    run "sudo monit restart heypic_server"
  end

  desc "Refresh shared node_modules symlink to current node_modules"
  task :refresh_symlink do
    run "ln -s #{shared_path}/node_modules #{current_path}/node_modules"
  end

  desc "Set up redis, monit, node modules non-globally"
  task :heypic_setup do

    run "sudo cp #{current_path}/script/monitrc /etc/"

    run "sudo mkdir -p /etc/monit.d/"

    run "sudo cp #{current_path}/script/monit/redis /etc/monit.d/"

    run "sudo cp #{current_path}/script/monit/heypic_streamer /etc/monit.d/"
    run "sudo cp #{current_path}/script/monit/heypic_processor /etc/monit.d/"
    run "sudo cp #{current_path}/script/monit/heypic_server /etc/monit.d/"

    run "sudo chown -R deploy:deploy /etc/monit.d/heypic_streamer"
    run "sudo chown -R deploy:deploy /etc/monit.d/heypic_processor"
    run "sudo chown -R deploy:deploy /etc/monit.d/heypic_server"

    run "sudo /etc/init.d/monit restart"

    # "Install node modules non-globally"
    run "mkdir -p #{shared_path}/node_modules"
    run "cd #{shared_path} && npm install hiredis redis express socket.io geocoder"
  end
end

after 'deploy:setup', "deploy:heypic_setup"
after "deploy:update", "deploy:refresh_symlink"
