const express = require('express');
const cors = require('cors');
const fs = require('fs')
const Compute = require('@google-cloud/compute');
const { Storage } = require('@google-cloud/storage');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const PORT = process.env.PORT || 4000;
const WAIT_BEFORE_EXECUTE = 6000; // wait 6 seconds

const app = express()

const templateRepository = 'template_repository';
const templateRegistry = 'template_registry';

const frontend = [
    'terraform/google/mern/prod/frontend.template',
    'terraform/google/mern/prod/variables.tf',
    'modules/react/prod/init-react.tpl',
]

const backend = [
    'terraform/google/mern/prod/backend.template',
    'terraform/google/mern/prod/variables.tf',
    'modules/nodejs/prod/init-nodejs.tpl',
    'modules/mongodb/init-mongodb.sh',
]

app.use(cors())
app.use(express.json())

app.post("/", async (req, res) => {
    try {

        const {
            instanceGroupName,
            projectName,
        } = req.body

        // Replace hyphens by underscores
        let resourceName = instanceGroupName.replace(/-/g, '_').trim().toLowerCase()
        let folders = ["backend", "frontend"]
        // let folders = "backend"
        let timestamp = Date.now()

        // Download the files
        downloadFiles(frontend, "./terraform/frontend")

        downloadFiles(backend, "./terraform/backend")

        // Wait 3 seconds for the dowload
        setTimeout(() => {

            createTerraformVariableFile("backend", req.body, resourceName)

            executeTerraform("backend", resourceName)
                .then(() => {
                    fs.readFile('terraform/backend/ip', 'utf-8', (err, data) => {
                        if (err) {
                            console.error(err)
                            return
                        }
                        createTerraformVariableFile("frontend", req.body, resourceName, data)

                        executeTerraform("frontend", resourceName)
                            .then(async () => {
                                // Get VM Instances
                                let newVMs = await getInstances(instanceGroupName)

                                // Export the generated terraform directory to template registry
                                uploadFiles(folders, projectName, instanceGroupName, timestamp)
                                res.send(newVMs)
                            })
                            .catch((error) => { console.error(error); res.status(500).send("Error during creation.") })
                    })
                })
                .catch((error) => { console.error(error); res.status(500).send("Error during creation.") })


        }, WAIT_BEFORE_EXECUTE);

    } catch (error) {
        console.error(error)
        res.status(500).send("Server error.")

    }

})

const downloadFiles = (files, path) => {

    // Creates a client
    const storage = new Storage();

    files.map(async (file) => {
        let destination = `${path}/${file.substring(file.lastIndexOf("/") + 1)}`
        try {
            await storage.bucket(templateRepository).file(file).download({ destination })
            console.log(`gs://${templateRepository}/${file} downloaded to ${destination}.`)
        }
        catch (error) {
            console.error(error)
        }
    })
}

const uploadFiles = async (folders, projectName, instanceGroupName, timestamp) => {

    const storage = new Storage();

    if (typeof folders === "string") {
        let path = `terraform/${folders}`

        return fs.readdir(path, async (err, files) => {
            if (err) {
                console.error(err)
                return
            }

            console.log("TIMESTAMP:", timestamp)

            // Import and remove each file one by one 
            files.forEach(file => {
                if (!fs.statSync(`${path}/${file}`).isDirectory()) {
                    let folders = path.substring(path.lastIndexOf("/") + 1)
                    let destination = `${instanceGroupName}-${projectName.replace(/ /g, '-').trim().toLowerCase()}-${timestamp}/${folders}/${file}`
                    storage
                        .bucket(templateRegistry)
                        .upload(`${path}/${file}`, { destination })
                        .then(async (uploadedFile) => {
                            console.log(`${file} uploaded successfuly`)
                            // exec(`rm -rf ${path}/${file}`)
                            // .then((() => console.log(`Deleted ${file}.`)))
                            // .catch(console.error)
                        })
                        .catch(console.error)
                }
            })
            // exec(`rm -rf ${path}/.terraform`)
            //     .then((() => console.log("Deleted .terraform plugin folder.")))
            //     .catch(console.error)
        })
    } else if (folders instanceof Array) {
        return folders.forEach(folder => {
            let path = `terraform/${folder}`

            fs.readdir(path, async (err, files) => {
                if (err) {
                    console.error(err)
                    return
                }

                console.log("TIMESTAMP:", timestamp)

                // Import and remove each file one by one 
                files.forEach(file => {
                    if (!fs.statSync(`${path}/${file}`).isDirectory()) {
                        let folder = path.substring(path.lastIndexOf("/") + 1)
                        let destination = `${instanceGroupName}-${projectName.replace(/ /g, '-').trim().toLowerCase()}-${timestamp}/${folder}/${file}`
                        storage
                            .bucket(templateRegistry)
                            .upload(`${path}/${file}`, { destination })
                            .then(async (uploadedFile) => {
                                console.log(`${file} uploaded successfuly`)
                                // exec(`rm -rf ${path}/${file}`)
                                // .then((() => console.log(`Deleted ${file}.`)))
                                // .catch(console.error)
                            })
                            .catch(console.error)
                    }
                })
                // exec(`rm -rf ${path}/.terraform`)
                //     .then((() => console.log("Deleted .terraform plugin folder.")))
                //     .catch(console.error)
            })
        })
    }
}

const getInstances = async (prefix) => {
    const compute = new Compute()
    return compute
        .getVMs({ filter: `name eq ^${prefix}.*` })
        .then(data => {
            let vms = data[0].map(element => element.metadata)
            let newVMs = vms.map(({ name }) => ({ name }))

            // console.log(newVMs)

            return newVMs;
        })
        .catch(console.error)
}

const createTerraformVariableFile = async (folder, body, resourceName, frontend_react_app_backend_url = '') => {

    const { numberOfVm, instanceGroupName, cpu, memory, disk, osType, osImage, applicationType, projectRepository, frontendOptions, backendOptions } = body
    const {
        frontend_project_repository,
    } = frontendOptions;

    const {
        backend_project_repository,
        backend_main_file,
        backend_port,
        backend_db_uri,
    } = backendOptions;

    let instance = {
        number_of_vm: numberOfVm,
        vm_group_name: instanceGroupName,
        cpu: cpu,
        memory: memory,
        disk_size_gb: disk,
        image_project: osType,
        image_family: osImage,
        application_type: applicationType,
        frontend_project_repository,
        frontend_project_name: frontend_project_repository.replace(".git", "").substring(frontend_project_repository.lastIndexOf("/") + 1),
        backend_project_repository,
        backend_project_name: backend_project_repository.replace(".git", "").substring(backend_project_repository.lastIndexOf("/") + 1),
        backend_main_file,
        backend_port,
        backend_db_uri,
        nodejs_path: "./init-nodejs.tpl",
        react_path: "./init-react.tpl",
    }

    if (process.env.USER) {
        instance['user'] = process.env.USER
    }

    if (frontend_react_app_backend_url !== '') {
        instance['frontend_react_app_backend_url'] = frontend_react_app_backend_url;
    }

    if (process.env.KEY_LOCATION) {
        let keyLocation = process.env.KEY_LOCATION

        instance['private_key'] = keyLocation
        instance['public_key'] = `${keyLocation}.pub`
    }

    fs.writeFileSync(`terraform/${folder}/${resourceName}.auto.tfvars.json`, JSON.stringify(instance))
    console.log(`Created file terraform/${folder}/${resourceName}.auto.tfvars.json from request...`)
}

const executeTerraform = async (folders, resourceName) => {
    console.log(typeof folders)
    console.log(`STRING ${folders instanceof String}`)
    console.log(`ARRAY ${folders instanceof Array}`)
    console.log(`OBJECT ${folders instanceof Object}`)


    if (typeof folders === "string") {
        return exec(`make terraform-apply-${folders} RESOURCE_NAME=${resourceName}`)

            // When success
            .then(async ({ stdout, stderr, error }) => {
                if (error) { console.error(error); return }

                // Log output
                if (stderr) console.log(`stderr: ${stderr}`)
                if (stdout) console.log(`stdout: ${stdout}`)
            })
            .catch(error => {
                console.error(error)
                return
            })
    } else if (folders instanceof Array) {
        return folders.forEach(folder => {
            console.log("FOLDER:", folder)

            exec(`make terraform-apply-${folder} RESOURCE_NAME=${resourceName}`)

                // When success
                .then(async ({ stdout, stderr, error }) => {
                    if (error) { console.error(error); return }

                    // Log output
                    if (stderr) console.log(`stderr: ${stderr}`)
                    if (stdout) console.log(`stdout: ${stdout}`)
                })
                .catch(error => {
                    console.error(error)
                    return
                })
        })
    }

}

app.listen(PORT, () => {
    console.log('Listenning on port: ', PORT)
})