terraform-apply-backend: 
	cd terraform/backend && \
	sed -e "s/RESOURCE_NAME/${RESOURCE_NAME}/" backend.template > ${RESOURCE_NAME}.tf && \
	echo "Created file: ${RESOURCE_NAME}.tf from backend.template..." && \
	 terraform init && \
	 terraform plan -out ${RESOURCE_NAME}.plan && \
	 terraform apply -state="${RESOURCE_NAME}.tfstate" -state-out="${RESOURCE_NAME}.tfstate" "${RESOURCE_NAME}.plan" && \
	 terraform show  


terraform-apply-frontend:
	cd terraform/frontend && \
	sed -e "s/RESOURCE_NAME/${RESOURCE_NAME}/" frontend.template > ${RESOURCE_NAME}.tf && \
	 echo "Created file: ${RESOURCE_NAME}.tf from frontend.template..." && \
	 terraform init && \
	 terraform plan -out ${RESOURCE_NAME}.plan && \
	 terraform apply -state="${RESOURCE_NAME}.tfstate" -state-out="${RESOURCE_NAME}.tfstate" "${RESOURCE_NAME}.plan" && \
	 terraform show  


