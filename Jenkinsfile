node('faas-cloud-frontend') {
    checkout scm 
    
    stage('pull github changes') {
        dir('/home/dmouhammad/portail') {
            sh "git pull origin master"
        }
    }
    
    stage('build') {
        dir('/home/dmouhammad/portail') {
            sh "npm run build"
        }
    }
    
    stage('deploy') {
        dir('/home/dmouhammad/portail') {
            sh "sudo cp -r ./build/* /var/www/faas-cloud-frontend.mouhammad.ml/html/"
        }
    }
}
