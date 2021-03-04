const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 4000;


const app = express()

const templateRepository = 'template_repository';
const templateRegistry = 'template_registry';

const files = [
    'terraform/google/mern/dev/template',
    'terraform/google/mern/dev/variables.tf',
    'modules/react/dev/init-react.sh',
    'modules/nodejs/dev/init-nodejs.sh',
    'modules/mongodb/init-mongodb.sh',
]

app.use(cors())
app.use(express.json())

app.post("/", async (req, res) => {
    try {

        const {
            projectName,
            projectArchitecture,
            applicationType,
            environment,
            SLA,
            dataSize,
            provider,
            instanceGroupName,
            numberOfVm,
            cpu,
            memory,
            disk,
            osType,
            osImage,
        } = req.body

        const util = require('util')

        const exec = util.promisify(require('child_process').exec);

        let instance = {
            number_of_vm: numberOfVm,
            vm_group_name: instanceGroupName,
            cpu: cpu,
            memory: memory,
            disk_size_gb: disk,
            image_project: osType,
            image_family: osImage,
            application_type: applicationType,
        }

        if (process.env.USER) {
            instance['user'] = process.env.USER
        }

        if (process.env.KEY_LOCATION) {
            let keyLocation = process.env.KEY_LOCATION

            instance['private_key'] = keyLocation
            instance['public_key'] = `${keyLocation}.pub`
        }

        let resourceName = instanceGroupName.replace(/-/g, '_').trim().toLowerCase()

        // Imports the Google Cloud client library
        const { Storage } = require('@google-cloud/storage');

        // Creates a client
        const storage = new Storage();

        // Download the files
        files.map(async (file) => {
            let destination = `./terraform/${file.substring(file.lastIndexOf("/") + 1, file.length)}`
            try {
                await storage.bucket(templateRepository).file(file).download({ destination })
                console.log(`gs://${templateRepository}/${file} downloaded to ${destination}.`)
            }
            catch (error) {
                console.error(error)
            }
        })

        // Wait 3 seconds for the dowload
        setTimeout(async () => {
            const fs = require('fs')

            // Create variable file
            fs.writeFileSync(`./terraform/${resourceName}.auto.tfvars.json`, JSON.stringify(instance))
            console.log(`Created file ${resourceName}.auto.tfvars.json from request...`)

            // Execute Terraform
            exec(`make terraform-apply RESOURCE_NAME=${resourceName}`)

                // When success
                .then(async ({ stdout, stderr }) => {

                    // Log output
                    console.log(stdout)
                    console.log(stderr)

                    // List VMs instances and their public IPs
                    const Compute = require('@google-cloud/compute')

                    const compute = new Compute()

                    let data = await compute.getVMs({ filter: `name eq ^${instanceGroupName}.*` })
                    let vms = data[0].map(element => element.metadata)
                    let newVMs = vms.map(({ name, networkInterfaces }) => ({ name, publicIP: networkInterfaces[0].accessConfigs[0].natIP }))

                    console.log(newVMs)

                    // Export the generated terraform directory to template registry
                    fs.readdir("./terraform/", async (err, files) => {
                        if (err) {
                            console.error(err)
                            return
                        }

                        let timestamp = Date.now()

                        // Import and remove each file one by one 
                        files.forEach(file => {
                            if (!fs.statSync(`terraform/${file}`).isDirectory()) {

                                let destination = `${instanceGroupName}-${projectName.replace(/ /g, '-').trim().toLowerCase()}-${timestamp}/${file}`
                                storage
                                    .bucket(templateRegistry)
                                    .upload(`terraform/${file}`, { destination })
                                    .then(async (uploadedFile) => {
                                        console.log(`${file} uploaded successfuly`)
                                        await exec(`rm -rf terraform/${file}`)
                                    })
                                    .catch(console.error)
                            }
                        })
                        await exec(`rm -rf terraform/.terraform`)
                    })

                    return res.send(newVMs)

                })
                .catch(error => {
                    console.error(error)
                    return res.status(500).send("Error during creation.")
                })
        }, 3000);
    } catch (error) {
        console.error(error.message)
    }

})

app.listen(PORT, () => {
    console.log('Listenning on port: ', PORT)
})