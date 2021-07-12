
variable "vm_group_name" {
  type    = string
  default = "bro"
}

variable "number_of_vm" {
  type    = number
  default = 1
}

variable "cpu" {
  type    = number
  default = 1
}

variable "memory" {
  type    = number
  default = 1024
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "zone" {
  type    = string
  default = "europe-west1-b"
}

variable "image_project" {
  type    = string
  default = "debian-cloud"
}

variable "image_family" {
  type    = string
  default = "debian-9"
}

variable "disk_size_gb" {
  type    = number
  default = 10
}

variable "user" {
  type    = string
  default = "dmouhammad"
}
variable "private_key" {
  type    = string
  default = "~/.ssh/google_compute_engine"
}

variable "public_key" {
  type    = string
  default = "~/.ssh/google_compute_engine.pub"
}

variable "application_type" {
  type    = string
  default = "dev"
}

variable "project_id" {
  type    = string
  default = "ept-project-301112"
}

variable "frontend" {
  type = object({
    name                  = string
    path                  = string
    project_name          = string
    project_repository    = string
    backend_url           = string
  })
  

  default = {
    name                  = ""
    path                  = ""
    project_name          = ""
    project_repository    = ""
    backend_url           = ""
  }
}

variable "backend" {
  type = object({
    name               = string
    path               = string
    project_name       = string
    project_repository = string
    port               = string
    db_uri             = string
    main_file          = string
  })
  
  default = {
    name               = ""
    path               = ""
    project_name       = ""
    project_repository = ""
    main_file          = "index.js"
    port               = "3000"
    db_uri             = ""
  }
}
        